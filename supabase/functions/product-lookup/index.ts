import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_BROWSER_ORIGINS = new Set([
  "http://localhost:19006",
  "http://localhost:3000",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Expose-Headers":
    "X-Woof-Function-Name, X-Woof-Function-Audit-Version",
  "Vary": "Origin",
};

const FUNCTION_NAME = "product-lookup";
const FUNCTION_AUDIT_VERSION = "2026-07-14-edge-verified-formula-family-v2";
const DEPLOYMENT_HEADERS = {
  "X-Woof-Function-Name": FUNCTION_NAME,
  "X-Woof-Function-Audit-Version": FUNCTION_AUDIT_VERSION,
};

const OPFF_BASE = "https://world.openpetfoodfacts.org";
const REQUEST_TIMEOUT_MS = 4_000;
const USER_AGENT = "Woof App - pet food scanner";
const MIN_SCORABLE_CATALOG_RANK = 3;
const CATALOG_SELECT = [
  "cache_key",
  "product_name",
  "brand",
  "gtin",
  "product_line",
  "flavor",
  "life_stage",
  "food_form",
  "package_size",
  "pet_type",
  "ingredients",
  "ingredient_text",
  "ingredient_count",
  "nutritional_info",
  "nutrient_panel",
  "has_published_nutrients",
  "source",
  "source_quality",
  "ingredient_verification_status",
  "image_verification_status",
  "verified_at",
  "source_url",
  "image_url",
  "expires_at",
  "is_complete_food",
  "catalog_exclusion_reason",
].join(", ");
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
const CATALOG_QUALITY_STATES = {
  VERIFIED_READY: "verified_ready",
  IDENTITY_ONLY: "identity_only",
  NEEDS_INGREDIENTS: "needs_ingredients",
  NEEDS_IMAGE: "needs_image",
  EXCLUDED: "excluded",
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function configuredAllowedOrigins(): Set<string> {
  const configured = Deno.env.get("WOOF_ALLOWED_ORIGINS") || "";
  const origins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_BROWSER_ORIGINS, ...origins]);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": "*" };
  }

  if (configuredAllowedOrigins().has(origin)) {
    return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS, "Access-Control-Allow-Origin": origin };
  }

  return { ...CORS_HEADERS, ...DEPLOYMENT_HEADERS };
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = CORS_HEADERS,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...DEPLOYMENT_HEADERS, ...headers, "Content-Type": "application/json" },
  });
}

function compact(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lower(value: unknown): string {
  return compact(value).toLowerCase();
}

function normalizeIdentity(value: unknown): string {
  return lower(value)
    .replace(/\(r\)|\(tm\)|\(c\)|®|™|©/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function barcodeVariants(value: unknown): string[] {
  const digits = compact(value).replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set([digits]);
  if (digits.length === 12) variants.add(`0${digits}`);
  if (digits.length === 13 && digits.startsWith("0")) variants.add(digits.slice(1));
  return [...variants];
}

function imageOrNull(value: unknown): string | null {
  const url = compact(value);
  if (!url || /^data:/i.test(url)) return null;
  return url;
}

function detectPetType(product: Record<string, any>): string {
  if (product.petType === "dog" || product.petType === "cat") return product.petType;
  if (product.pet_type === "dog" || product.pet_type === "cat") return product.pet_type;

  const text = [
    product.productName,
    product.product_name,
    product.brand,
    product.brands,
    product.categories,
    Array.isArray(product.categories_tags) ? product.categories_tags.join(" ") : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("dog") || text.includes("chien")) return "dog";
  if (text.includes("cat") || text.includes("chat")) return "cat";
  return "unknown";
}

function ingredientList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => compact(item)).filter(Boolean);
}

function normalizeProduct(raw: Record<string, any>): Record<string, unknown> {
  const product = raw.product || raw;
  const nutriments = product.nutriments || {};

  return {
    productName: product.product_name || product.product_name_en || "",
    brand: product.brands || "",
    petType: detectPetType(product),
    barcode: product.code || product._id || "",
    ingredientsText: product.ingredients_text || product.ingredients_text_en || "",
    ingredients: Array.isArray(product.ingredients)
      ? product.ingredients.map((ingredient: Record<string, any>) => ({
          id: ingredient.id || "",
          text: ingredient.text || "",
          percent: ingredient.percent_estimate ?? null,
        }))
      : [],
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
    nutriscoreGrade: product.nutriscore_grade || product.nutrition_grades || null,
    novaGroup: product.nova_group ?? null,
    imageUrl: product.image_url || product.image_front_url || null,
    source: "open_pet_food_facts",
    sourceQuality: "community",
    sourceUrl: product.url || null,
    sourceKind: "opff",
  };
}

function normalizeCatalogProduct(raw: Record<string, any>): Record<string, unknown> {
  const row = raw.product || raw;
  const ingredients = ingredientList(row.ingredients);
  const ingredientText = compact(row.ingredient_text) || ingredients.join(", ");
  const nutriments = row.nutritional_info || row.nutrient_panel || {};

  const product = {
    id: row.cache_key || row.gtin || row.product_name || "",
    cacheKey: compact(row.cache_key),
    gtin: compact(row.gtin),
    barcode: compact(row.gtin),
    productName: compact(row.product_name),
    brand: compact(row.brand),
    productLine: compact(row.product_line),
    flavor: compact(row.flavor),
    lifeStage: compact(row.life_stage),
    foodForm: compact(row.food_form),
    packageSize: compact(row.package_size),
    petType: detectPetType(row),
    ingredientsText: ingredientText,
    ingredients: ingredients.map((text) => ({ id: "", text, percent: null })),
    ingredientCount: Number(row.ingredient_count ?? ingredients.length) || 0,
    nutriments: {
      protein: nutriments.protein ?? nutriments.proteins_100g ?? nutriments.proteins ?? null,
      fat: nutriments.fat ?? nutriments.fat_100g ?? null,
      fiber: nutriments.fiber ?? nutriments.fiber_100g ?? nutriments["crude-fiber_100g"] ?? null,
      energy: nutriments.energy ?? nutriments["energy-kcal_100g"] ?? nutriments.energy_100g ?? null,
    },
    nutritionalInfo: row.nutritional_info || null,
    nutrientPanel: row.nutrient_panel || null,
    hasPublishedNutrients: row.has_published_nutrients ?? false,
    imageUrl: imageOrNull(row.image_url),
    source: compact(row.source) || "woof_catalog",
    sourceQuality: compact(row.source_quality) || "unknown",
    ingredientVerificationStatus: compact(row.ingredient_verification_status),
    imageVerificationStatus: compact(row.image_verification_status),
    verifiedAt: row.verified_at || null,
    sourceUrl: compact(row.source_url),
    expiresAt: row.expires_at || null,
    isCompleteFood: row.is_complete_food ?? true,
    catalogExclusionReason: compact(row.catalog_exclusion_reason),
    rank: Number(row.rank) || 0,
    sourceKind: "catalog",
  };

  const verificationState = catalogVerificationState(product);
  return {
    ...product,
    verificationState,
    catalogQualityState: verificationState.state,
  };
}

function hasVerifiedIngredientData(product: Record<string, any>): boolean {
  const ingredientCount = Number(product.ingredientCount || 0);
  if (!product.ingredientsText && ingredientCount < 5) return false;
  if (!compact(product.sourceUrl)) return false;
  return VERIFIED_INGREDIENT_STATUSES.has(lower(product.ingredientVerificationStatus));
}

function hasVerifiedImageData(product: Record<string, any>): boolean {
  if (!imageOrNull(product.imageUrl)) return false;
  if (!compact(product.sourceUrl)) return false;
  return VERIFIED_IMAGE_STATUSES.has(lower(product.imageVerificationStatus));
}

function isCurrentCatalogProduct(product: Record<string, any>): boolean {
  if (product.isCompleteFood !== true) return false;
  if (product.catalogExclusionReason) return false;
  if (product.petType !== "dog" && product.petType !== "cat") return false;
  if (product.expiresAt && Date.parse(product.expiresAt) <= Date.now()) return false;
  return true;
}

function isScorableCatalogProduct(
  product: Record<string, any>,
  { requireRank = true } = {},
): boolean {
  if (product.sourceKind !== "catalog") return false;
  if (!isCurrentCatalogProduct(product)) return false;
  if (!hasVerifiedIngredientData(product)) return false;
  if (!hasVerifiedImageData(product)) return false;
  if (requireRank && Number(product.rank || 0) < MIN_SCORABLE_CATALOG_RANK) return false;
  return true;
}

function productFormulaKey(product: Record<string, any>): string {
  // Keep separate GTINs for barcode lookup, but collapse only exact,
  // source-verified formulas in text search. Different ingredient statements
  // are never treated as interchangeable package sizes.
  const verifiedIngredientSignature = hasVerifiedIngredientData(product)
    ? normalizeIdentity(product.ingredientsText)
    : "";
  if (verifiedIngredientSignature) {
    return normalizeIdentity([
      product.brand,
      product.petType,
      product.foodForm,
      product.lifeStage,
      verifiedIngredientSignature,
    ].map(compact).filter(Boolean).join(" "));
  }

  const formulaIdentity = [
    product.brand,
    product.productLine,
    product.productName,
    product.flavor,
    product.lifeStage,
    product.foodForm,
    product.petType,
  ].map(compact).filter(Boolean).join(" ");

  return normalizeIdentity(formulaIdentity)
    || compact(product.cacheKey)
    || compact(product.gtin || product.barcode)
    || normalizeIdentity(product.productName);
}

function packageSizesForProduct(product: Record<string, any>): string[] {
  const values = [
    ...(Array.isArray(product.availablePackageSizes) ? product.availablePackageSizes : []),
    product.packageSize,
  ].map(compact).filter(Boolean);
  return [...new Map(values.map((size) => [normalizeIdentity(size), size])).values()];
}

function mergeFormulaPackageSizes(
  primary: Record<string, unknown>,
  duplicate: Record<string, unknown>,
): Record<string, unknown> {
  const sizes = packageSizesForProduct(primary as Record<string, any>);
  const seen = new Set(sizes.map(normalizeIdentity));
  for (const size of packageSizesForProduct(duplicate as Record<string, any>)) {
    if (seen.has(normalizeIdentity(size))) continue;
    seen.add(normalizeIdentity(size));
    sizes.push(size);
  }
  return sizes.length > 1 ? { ...primary, availablePackageSizes: sizes } : primary;
}

function dedupeCatalogFormulaProducts(products: Record<string, unknown>[]): Record<string, unknown>[] {
  const indices = new Map<string, number>();
  const deduped: Record<string, unknown>[] = [];

  for (const product of products) {
    const key = productFormulaKey(product as Record<string, any>);
    if (!key) continue;
    const existingIndex = indices.get(key);
    if (existingIndex !== undefined) {
      deduped[existingIndex] = mergeFormulaPackageSizes(deduped[existingIndex], product);
      continue;
    }
    indices.set(key, deduped.length);
    deduped.push(product);
  }

  return deduped;
}

function catalogVerificationState(product: Record<string, any>): Record<string, unknown> {
  const gaps: string[] = [];
  const petType = lower(product.petType);
  const excluded = product.isCompleteFood === false || Boolean(compact(product.catalogExclusionReason));
  const hasKnownPetType = petType === "dog" || petType === "cat";
  const hasIngredients = hasVerifiedIngredientData(product);
  const hasImage = hasVerifiedImageData(product);

  if (!hasKnownPetType) gaps.push("unknown_pet_type");
  if (!hasIngredients) gaps.push("unverified_ingredients");
  if (!hasImage) gaps.push(product.imageUrl ? "unverified_image" : "missing_image");
  if (excluded) gaps.push("excluded");

  let state = CATALOG_QUALITY_STATES.VERIFIED_READY;
  if (excluded) state = CATALOG_QUALITY_STATES.EXCLUDED;
  else if (!hasKnownPetType) state = CATALOG_QUALITY_STATES.IDENTITY_ONLY;
  else if (!hasIngredients) state = CATALOG_QUALITY_STATES.NEEDS_INGREDIENTS;
  else if (!hasImage) state = CATALOG_QUALITY_STATES.NEEDS_IMAGE;

  return {
    state,
    readyToScore: state === CATALOG_QUALITY_STATES.VERIFIED_READY,
    gaps,
    source: compact(product.source),
    sourceQuality: compact(product.sourceQuality),
    sourceUrl: compact(product.sourceUrl),
    verifiedAt: product.verifiedAt || null,
    ingredientVerificationStatus: compact(product.ingredientVerificationStatus),
    imageVerificationStatus: compact(product.imageVerificationStatus),
  };
}

function resolverResponse({
  found,
  product = null,
  products = [],
  status = "not_found",
  confidence = 0,
  source,
}: {
  found: boolean;
  product?: Record<string, unknown> | null;
  products?: Record<string, unknown>[];
  status?: string;
  confidence?: number;
  source?: string;
}): Record<string, unknown> {
  const selectedProduct = product || products[0] || null;
  const verificationState = selectedProduct
    ? catalogVerificationState(selectedProduct as Record<string, any>)
    : { state: status, readyToScore: false, gaps: found ? ["unverified_ingredients"] : ["not_found"] };

  return {
    found,
    status,
    confidence,
    product,
    products,
    selectedProduct,
    verificationState,
    source,
    resultCount: products.length || (product ? 1 : 0),
  };
}

async function fetchJson(url: string): Promise<Record<string, any> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.log("[PRODUCT_LOOKUP] OPFF HTTP", response.status);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.log("[PRODUCT_LOOKUP] OPFF fetch error:", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchVerifiedCatalog(
  supabase: any,
  query: string,
  limit = 8,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc("search_verified_products", {
    q: query,
    max_results: Math.max(1, Math.min(limit, 25)),
  });

  if (error) {
    console.log("[PRODUCT_LOOKUP] search_verified_products error:", error.message);
    return [];
  }

  const products = (Array.isArray(data) ? data : [])
    .map((row) => normalizeCatalogProduct(row))
    .filter((product) => isScorableCatalogProduct(product as Record<string, any>));

  return dedupeCatalogFormulaProducts(products);
}

async function findCatalogByBarcode(
  supabase: any,
  barcode: string,
): Promise<Record<string, unknown> | null> {
  const variants = barcodeVariants(barcode);
  if (variants.length === 0) return null;

  const products: Record<string, unknown>[] = [];
  const { data, error } = await supabase
    .from("product_data")
    .select(CATALOG_SELECT)
    .in("gtin", variants)
    .limit(12);

  if (error) {
    console.log("[PRODUCT_LOOKUP] product_data barcode lookup error:", error.message);
  } else {
    for (const row of Array.isArray(data) ? data : []) {
      products.push({ ...normalizeCatalogProduct(row), rank: 100 });
    }
  }

  if (products.length === 0) {
    for (const variant of variants) {
      const matches = await searchVerifiedCatalog(supabase, variant, 8);
      for (const product of matches) {
        const productVariants = barcodeVariants((product as Record<string, unknown>).gtin || (product as Record<string, unknown>).barcode);
        if (productVariants.some((candidate) => variants.includes(candidate))) {
          products.push(product);
        }
      }
    }
  }

  const seen = new Set<string>();
  return products
    .filter((product) => {
      const typed = product as Record<string, any>;
      const key = compact(typed.cacheKey || typed.gtin || typed.barcode);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return isScorableCatalogProduct(typed, { requireRank: false });
    })
    .sort((left, right) => Number((right as Record<string, any>).ingredientCount || 0) - Number((left as Record<string, any>).ingredientCount || 0))[0] || null;
}

async function lookupBarcode(supabase: any, barcode: string): Promise<Record<string, unknown>> {
  const catalogProduct = await findCatalogByBarcode(supabase, barcode);
  if (catalogProduct) {
    return resolverResponse({
      found: true,
      status: "verified_ready",
      confidence: 1,
      product: catalogProduct,
      products: [catalogProduct],
      source: "verified_catalog",
    });
  }

  const url = `${OPFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const data = await fetchJson(url);

  if (!data?.product || data.status === 0) {
    return resolverResponse({ found: false });
  }

  const product = normalizeProduct(data);
  return resolverResponse({
    found: true,
    status: "identity_only",
    confidence: 0.4,
    product,
    products: [product],
    source: "open_pet_food_facts",
  });
}

async function searchByName(supabase: any, name: string): Promise<Record<string, unknown>> {
  const catalogProducts = await searchVerifiedCatalog(supabase, name, 8);
  if (catalogProducts.length > 0) {
    return resolverResponse({
      found: true,
      status: "verified_ready",
      confidence: 1,
      product: catalogProducts[0],
      products: catalogProducts,
      source: "verified_catalog",
    });
  }

  const url = `${OPFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(name)}&json=true&page_size=5`;
  const data = await fetchJson(url);
  const products = Array.isArray(data?.products) ? data.products : [];

  if (products.length === 0) {
    return resolverResponse({ found: false });
  }

  const product = normalizeProduct(products[0]);
  return resolverResponse({
    found: true,
    status: "identity_only",
    confidence: 0.4,
    product,
    products: products.map((raw: Record<string, any>) => normalizeProduct(raw)),
    source: "open_pet_food_facts",
  });
}

Deno.serve(async (req) => {
  const responseHeaders = corsHeaders(req);
  const json = (body: Record<string, unknown>, status = 200) =>
    jsonResponse(body, status, responseHeaders);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing auth token" }, 401);
  }

  let supabaseUrl: string;
  let supabaseServiceKey: string;
  try {
    supabaseUrl = requiredEnv("SUPABASE_URL");
    supabaseServiceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch (err) {
    console.error("[PRODUCT_LOOKUP] Server configuration error:", (err as Error).message);
    return json({ error: "Server configuration error" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.substring(7));

  if (authError || !user) {
    console.error("[PRODUCT_LOOKUP] Auth failed:", authError?.message || "No user");
    return json({ error: "Invalid auth token" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (body.type === "barcode") {
    const barcode = typeof body.barcode === "string" ? body.barcode.trim() : "";
    if (!/^[0-9]{6,18}$/.test(barcode)) {
      return json({ error: "Invalid barcode" }, 400);
    }

    return json(await lookupBarcode(supabase, barcode));
  }

  if (body.type === "search") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 3 || name.length > 160) {
      return json({ error: "Invalid search term" }, 400);
    }

    return json(await searchByName(supabase, name));
  }

  return json({ error: 'Invalid type. Expected "barcode" or "search".' }, 400);
});
