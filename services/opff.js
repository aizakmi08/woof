import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config/env";
import { supabase } from "./supabase";
import { createLogger } from "./logger";

const OPFF_BASE = "https://world.openpetfoodfacts.org";
const PRODUCT_LOOKUP_URL = `${SUPABASE_URL}/functions/v1/product-lookup`;
const logger = createLogger("OPFF");

function normalizeProduct(raw) {
  const p = raw.product || raw;

  const nutriments = p.nutriments || p.nutritionalInfo || p.nutritional_info || p.nutrientPanel || p.nutrient_panel || {};
  const ingredientItems = Array.isArray(p.ingredients) ? p.ingredients : [];
  const ingredientsText =
    p.ingredientsText ||
    p.ingredientText ||
    p.ingredients_text ||
    p.ingredients_text_en ||
    (ingredientItems.every((ing) => typeof ing === "string") ? ingredientItems.join(", ") : "");

  return {
    id: p.id || p.cacheKey || p.cache_key || p.code || p._id || "",
    cacheKey: p.cacheKey || p.cache_key || "",
    gtin: p.gtin || p.barcode || p.code || p._id || "",
    productName: p.productName || p.product_name || p.product_name_en || "",
    brand: p.brand || p.brands || "",
    productLine: p.productLine || p.product_line || "",
    flavor: p.flavor || "",
    lifeStage: p.lifeStage || p.life_stage || "",
    foodForm: p.foodForm || p.food_form || "",
    packageSize: p.packageSize || p.package_size || "",
    petType: detectPetType(p),
    barcode: p.barcode || p.gtin || p.code || p._id || "",
    ingredientsText,
    ingredients: ingredientItems.map((ing) => ({
      id: typeof ing === "string" ? "" : ing.id || "",
      text: typeof ing === "string" ? ing : ing.text || "",
      percent: typeof ing === "string" ? null : ing.percent_estimate ?? null,
    })),
    nutriments: {
      protein: nutriments.protein ?? nutriments.proteins_100g ?? nutriments.proteins ?? null,
      fat: nutriments.fat ?? nutriments.fat_100g ?? null,
      fiber:
        nutriments.fiber ??
        nutriments.fiber_100g ??
        nutriments["crude-fiber_100g"] ??
        null,
      energy: nutriments.energy ?? nutriments["energy-kcal_100g"] ?? nutriments.energy_100g ?? null,
    },
    nutriscoreGrade: p.nutriscore_grade || p.nutrition_grades || null,
    novaGroup: p.nova_group ?? null,
    imageUrl: p.imageUrl || p.image_url || p.image_front_url || null,
    ingredientCount: p.ingredientCount ?? p.ingredient_count ?? ingredientItems.length,
    nutritionalInfo: p.nutritionalInfo || p.nutritional_info || null,
    nutrientPanel: p.nutrientPanel || p.nutrient_panel || null,
    hasPublishedNutrients: p.hasPublishedNutrients ?? p.has_published_nutrients ?? false,
    source: p.source || null,
    sourceQuality: p.sourceQuality || p.source_quality || null,
    ingredientVerificationStatus: p.ingredientVerificationStatus || p.ingredient_verification_status || null,
    imageVerificationStatus: p.imageVerificationStatus || p.image_verification_status || null,
    verifiedAt: p.verifiedAt || p.verified_at || null,
    sourceUrl: p.sourceUrl || p.source_url || null,
    rank: p.rank || 0,
    sourceKind: p.sourceKind || p.source_kind || null,
    verificationState: p.verificationState || null,
    catalogQualityState: p.catalogQualityState || p.catalog_quality_state || p.verificationState?.state || null,
  };
}

function detectPetType(p) {
  if (p.petType === "dog" || p.petType === "cat") return p.petType;

  const text = [
    p.productName,
    p.product_name,
    p.brand,
    p.brands,
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

export async function lookupBarcode(barcode) {
  logger.debug("[OPFF] lookupBarcode called with:", barcode);
  const edgeResult = await callProductLookup({ type: "barcode", barcode });
  if (edgeResult) {
    logger.debug("[OPFF] product-lookup function barcode:", edgeResult.found ? "FOUND" : "MISS");
    return {
      found: edgeResult.found,
      status: edgeResult.status || null,
      products: Array.isArray(edgeResult.products)
        ? edgeResult.products.map((product) => normalizeProduct(product))
        : [],
      selectedProduct: edgeResult.selectedProduct
        ? normalizeProduct(edgeResult.selectedProduct)
        : null,
      verificationState: edgeResult.verificationState || null,
      product: edgeResult.found
        ? normalizeProduct(edgeResult.product || edgeResult)
        : null,
    };
  }

  return lookupBarcodeDirect(barcode);
}

export async function searchByName(name) {
  logger.debug("[OPFF] searchByName called with:", name);
  const edgeResult = await callProductLookup({ type: "search", name });
  if (edgeResult) {
    logger.debug("[OPFF] product-lookup function search:", edgeResult.found ? "FOUND" : "MISS");
    return {
      found: edgeResult.found,
      status: edgeResult.status || null,
      products: Array.isArray(edgeResult.products)
        ? edgeResult.products.map((product) => normalizeProduct(product))
        : [],
      selectedProduct: edgeResult.selectedProduct
        ? normalizeProduct(edgeResult.selectedProduct)
        : null,
      verificationState: edgeResult.verificationState || null,
      product: edgeResult.found
        ? normalizeProduct(edgeResult.product || edgeResult)
        : null,
    };
  }

  return searchByNameDirect(name);
}

async function callProductLookup(payload, fallbackPayload = null) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const firstResult = await requestProductLookup(payload, session.access_token, controller.signal);
    if (firstResult.data) return firstResult.data;

    if (fallbackPayload && firstResult.status >= 400 && firstResult.status < 500) {
      const fallbackResult = await requestProductLookup(
        fallbackPayload,
        session.access_token,
        controller.signal
      );
      if (fallbackResult.data) return fallbackResult.data;
    }

    return null;
  } catch (err) {
    logger.debug("[OPFF] product-lookup function error:", err.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestProductLookup(payload, accessToken, signal) {
  const response = await fetch(PRODUCT_LOOKUP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    logger.debug("[OPFF] product-lookup function HTTP", response.status);
    return { data: null, status: response.status };
  }

  const data = await response.json();
  return {
    data: typeof data?.found === "boolean" ? data : null,
    status: response.status,
  };
}

async function lookupBarcodeDirect(barcode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `${OPFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`;
    logger.debug("[OPFF] GET", url);
    const response = await fetch(url, {
      headers: { "User-Agent": "Woof App - pet food scanner" },
      signal: controller.signal,
    });

    logger.debug("[OPFF] lookupBarcode response status:", response.status);

    if (!response.ok) {
      logger.debug("[OPFF] lookupBarcode failed — HTTP", response.status);
      return { found: false };
    }

    const data = await response.json();

    if (!data.product || data.status === 0) {
      logger.debug("[OPFF] lookupBarcode — product not found in response");
      return { found: false };
    }

    const product = normalizeProduct(data);
    logger.debug("[OPFF] lookupBarcode — FOUND:", product.productName, "|", product.brand);
    return { found: true, product };
  } catch (err) {
    logger.debug("[OPFF] lookupBarcode error:", err.message);
    return { found: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function searchByNameDirect(name) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `${OPFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(name)}&json=true&page_size=5`;
    logger.debug("[OPFF] GET", url);
    const response = await fetch(url, {
      headers: { "User-Agent": "Woof App - pet food scanner" },
      signal: controller.signal,
    });

    logger.debug("[OPFF] searchByName response status:", response.status);

    if (!response.ok) {
      logger.debug("[OPFF] searchByName failed — HTTP", response.status);
      return { found: false };
    }

    const data = await response.json();

    if (!data.products || data.products.length === 0) {
      logger.debug("[OPFF] searchByName — no results found");
      return { found: false };
    }

    const product = normalizeProduct(data.products[0]);
    logger.debug("[OPFF] searchByName — FOUND:", product.productName, "| results:", data.products.length);
    return { found: true, product };
  } catch (err) {
    logger.debug("[OPFF] searchByName error:", err.message);
    return { found: false };
  } finally {
    clearTimeout(timeout);
  }
}
