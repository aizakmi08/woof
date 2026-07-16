import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { AppText as Text, AppTextInput as TextInput } from "../components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { BadgeCheck, Camera, ChevronLeft, Search, ScanLine, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  collapseRepeatedIdentityText,
  resolveProduct,
} from "../services/productCatalog";
import { labelOcrIsAvailable, recognizeLabelText } from "../services/labelOcr";
import { filterProductsForOcr } from "../services/labelOcrMatching";
import {
  catalogVerificationState,
  productIsVerifiedReady,
} from "../services/catalogQuality";
import {
  getCachedCatalogSearch,
  saveCachedCatalogSearch,
} from "../services/catalogSearchCache";
import {
  logCatalogLookupEvent,
  logCatalogVerificationGapEvent,
} from "../services/catalogCoverage";
import { trackEvent } from "../services/analytics";
import { createLogger } from "../services/logger";
import { useTheme, Colors, Spacing, Shadows } from "../theme";

const logger = createLogger("PRODUCT_SEARCH");
const MIN_QUERY_LENGTH = 2;
const SEARCH_RESULT_LIMIT = 12;
const EMPTY_OCR_LINES = Object.freeze([]);
const LABEL_RECONCILIATION_GRACE_MS = 250;
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
const PRODUCT_QUERY_REQUIRED_TERMS = new Set([
  "adult",
  "senior",
  "puppy",
  "kitten",
  "small",
  "toy",
  "large",
  "weight",
  "indoor",
  "hairball",
  "sensitive",
  "digestive",
  "urinary",
  "mobility",
  "joint",
  "skin",
  "coat",
  "ancient",
  "grains",
  "grain",
  "free",
  "95",
  "hydrolyzed",
  "vegetarian",
  "plant",
  "salmon",
  "chicken",
  "beef",
  "turkey",
  "lamb",
  "duck",
  "fish",
  "whitefish",
  "ocean",
  "tuna",
  "trout",
  "venison",
  "insect",
  "bison",
  "broth",
  "crab",
  "pollock",
  "cod",
  "liver",
  "mackerel",
  "mousse",
  "sole",
  "shrimp",
  "prawn",
  "prawns",
  "pumpkin",
  "quail",
  "rabbit",
  "sardine",
  "sardines",
  "seabass",
  "tilapia",
  "cluster",
  "clusters",
  "dehydrated",
  "cuts",
  "gravy",
  "loaf",
  "minced",
  "morsels",
  "oatmeal",
  "pate",
  "pat",
  "paté",
  "rice",
  "shreds",
  "stew",
  "stews",
  "potato",
  "sweet",
  "wholemade",
  "prime",
  "rib",
  "filet",
  "mignon",
  "giblets",
]);
const NON_ADULT_LIFE_STAGE_TERMS = new Set([
  "puppy",
  "kitten",
  "senior",
  "mature",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function productIdentityText(product = {}) {
  return [
    product.brand,
    product.productLine,
    product.productName,
    product.flavor,
    product.lifeStage,
    product.foodForm,
    product.packageSize,
    product.gtin || product.barcode,
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function sourceLabel(product) {
  if (product.sourceQuality === "gdsn") return "GDSN";
  if (product.sourceQuality === "official") return "Official feed";
  if (product.sourceQuality === "manufacturer") return "Manufacturer";
  if (product.sourceQuality === "retailer_verified") return "Retailer verified";
  if (product.sourceKind === "opff") return "Open Pet Food Facts";
  if (product.source === "amazon") return "Catalog";
  if (product.source === "web_verified") return "Verified web";
  if (product.source === "dfa") return "Dog Food Advisor";
  return product.source ? product.source.replace(/_/g, " ") : "Catalog";
}

function productHasSourceEvidence(product) {
  return Boolean(String(product?.sourceUrl || product?.source_url || "").trim());
}

function productHasVerifiedImage(product) {
  const status = String(product?.imageVerificationStatus || "").toLowerCase();
  return Boolean(product?.imageUrl) && VERIFIED_IMAGE_STATUSES.has(status);
}

function productMatchesQueryTerms(product, queryText = "") {
  const queryTokens = tokenSet(queryText);
  const productTokens = tokenSet(productIdentityText(product));

  for (const token of queryTokens) {
    if (!PRODUCT_QUERY_REQUIRED_TERMS.has(token)) continue;
    if (productTokens.has(token)) continue;
    if (token === "adult") {
      const hasNonAdultLifeStage = [...NON_ADULT_LIFE_STAGE_TERMS].some((term) => productTokens.has(term));
      if (!hasNonAdultLifeStage) continue;
    }

    return false;
  }

  return true;
}

function productIsReady(product) {
  return productIsVerifiedReady(product);
}

function ingredientStatusLabel(product) {
  return catalogVerificationState(product).label;
}

function productVariantLabel(product) {
  const packageSizes = Array.isArray(product?.availablePackageSizes)
    ? product.availablePackageSizes.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const packageSize = packageSizes.length > 1
    ? packageSizes.join(" + ")
    : product?.packageSize;

  return [
    packageSize,
    product?.flavor,
    product?.lifeStage,
    product?.foodForm,
    product?.productLine,
  ].map(formatVariantValue).filter(Boolean).join(" • ");
}

function formatVariantValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "freeze_dried" || normalized === "freeze-dried") return "Freeze-dried";
  return String(value)
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelSummaryTitle(identification = {}) {
  const brand = collapseRepeatedIdentityText(identification.brand);
  const productName = collapseRepeatedIdentityText(identification.productName);
  if (!productName) return brand || "No readable product label";
  if (brand && !normalizeText(productName).includes(normalizeText(brand))) {
    return collapseRepeatedIdentityText(`${brand} ${productName}`);
  }
  return productName;
}

function ingredientCaptureProduct(product = {}) {
  if (!product) return null;
  return {
    cacheKey: product.cacheKey || null,
    gtin: product.gtin || product.barcode || null,
    productName: product.productName || null,
    brand: product.brand || null,
    productLine: product.productLine || null,
    flavor: product.flavor || null,
    lifeStage: product.lifeStage || null,
    foodForm: product.foodForm || null,
    packageSize: product.packageSize || null,
    petType: product.petType || null,
    source: product.source || null,
    sourceQuality: product.sourceQuality || null,
    sourceUrl: product.sourceUrl || null,
  };
}

function hasUsableLabelResult(result) {
  return Boolean(
    result?.selectedProduct
    || result?.identification?.found
    || result?.products?.length
  );
}

function pickBestLabelOutcome(outcomes = []) {
  const usable = outcomes.filter((outcome) => hasUsableLabelResult(outcome?.result));
  const cloud = usable.find((outcome) => outcome.path === "cloud_image");
  const onDevice = usable.find((outcome) => outcome.path === "on_device_ocr");

  const cloudSelected = cloud?.result?.selectedProduct;
  const onDeviceSelected = onDevice?.result?.selectedProduct;

  if (cloudSelected && onDeviceSelected) {
    const cloudMatchesVisibleText = filterProductsForOcr(
      [cloudSelected],
      onDevice.result.query
    ).length === 1;
    if (!cloudMatchesVisibleText) return onDevice;

    const sameCatalogProduct = String(cloudSelected.cacheKey || cloudSelected.id || "")
      === String(onDeviceSelected.cacheKey || onDeviceSelected.id || "");
    return sameCatalogProduct ? cloud : onDevice;
  }
  if (onDeviceSelected) return onDevice;
  if (cloud?.result?.identification?.excluded) return cloud;
  if (cloudSelected) return cloud;
  if (cloud) return cloud;
  return onDevice || usable[0] || null;
}

async function resolveOnDeviceLabel({
  labelOcrText,
  labelOcrLines,
  labelOcrDurationMs,
  labelImageUri,
  signal,
  onOcrCompleted,
}) {
  let text = String(labelOcrText || "").trim();
  let lines = Array.isArray(labelOcrLines) ? labelOcrLines : EMPTY_OCR_LINES;
  let durationMs = Number(labelOcrDurationMs) || null;
  if (!text && labelImageUri && labelOcrIsAvailable()) {
    const ocr = await recognizeLabelText(labelImageUri);
    text = ocr?.usable ? ocr.text : "";
    lines = ocr?.usable ? ocr.lines : EMPTY_OCR_LINES;
    durationMs = ocr?.durationMs || null;
    onOcrCompleted?.(ocr);
  }

  if (!text || signal?.aborted) return null;
  const result = await resolveProduct({
    type: "label_text",
    query: text,
    ocrLines: lines,
    signal,
    limit: SEARCH_RESULT_LIMIT,
  });

  return { result, path: "on_device_ocr", durationMs };
}

function resolveFastLabelLookup({ visualPromise, ocrPromise, signal }) {
  const attempts = [
    visualPromise && { path: "cloud_image", promise: visualPromise },
    ocrPromise && { path: "on_device_ocr", promise: ocrPromise },
  ].filter(Boolean);

  if (attempts.length === 0) {
    return Promise.reject(new Error("No readable label image or text was found."));
  }

  return new Promise((resolve, reject) => {
    const outcomes = [];
    const errors = [];
    let completed = 0;
    let settled = false;
    let visualFallbackTimer = null;

    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      if (visualFallbackTimer) clearTimeout(visualFallbackTimer);
      if (outcome) resolve(outcome);
      else reject(errors[0] || new Error("Could not identify that product label."));
    };

    const finishWhenComplete = () => {
      if (completed !== attempts.length) return;
      finish(pickBestLabelOutcome(outcomes));
    };

    for (const attempt of attempts) {
      attempt.promise
        .then((payload) => {
          if (settled || signal?.aborted) return;
          completed += 1;
          if (payload?.result) {
            const outcome = { ...payload, path: payload.path || attempt.path };
            outcomes.push(outcome);
            if (outcome.result.selectedProduct && outcome.path === "cloud_image") {
              visualFallbackTimer = setTimeout(() => {
                finish(pickBestLabelOutcome(outcomes));
              }, LABEL_RECONCILIATION_GRACE_MS);
              return;
            }
            if (outcome.result.selectedProduct && outcome.path === "on_device_ocr") {
              visualFallbackTimer = setTimeout(() => {
                finish(pickBestLabelOutcome(outcomes));
              }, LABEL_RECONCILIATION_GRACE_MS);
              return;
            }
            if (outcome.path === "on_device_ocr" && hasUsableLabelResult(outcome.result)) {
              visualFallbackTimer = setTimeout(() => {
                finish(pickBestLabelOutcome(outcomes));
              }, LABEL_RECONCILIATION_GRACE_MS);
              return;
            }
            if (outcome.path === "cloud_image" && hasUsableLabelResult(outcome.result)) {
              visualFallbackTimer = setTimeout(() => {
                finish(pickBestLabelOutcome(outcomes));
              }, LABEL_RECONCILIATION_GRACE_MS);
            }
          }
          finishWhenComplete();
        })
        .catch((error) => {
          if (settled || signal?.aborted) return;
          completed += 1;
          errors.push(error);
          finishWhenComplete();
        });
    }
  });
}

function ProductImage({ product, theme }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (product.imageUrl && !imageFailed) {
    return (
      <Image
        source={{ uri: product.imageUrl }}
        style={styles.productImage}
        resizeMode="cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <View style={[styles.productImagePlaceholder, { backgroundColor: theme.fill }]}>
      <ScanLine size={20} color={theme.textTertiary} strokeWidth={1.7} />
    </View>
  );
}

function ProductRow({ product, theme, onPress }) {
  const ready = productIsReady(product);
  const statusLabel = ingredientStatusLabel(product);
  const variantLabel = productVariantLabel(product);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.productRow,
        {
          backgroundColor: theme.card,
          borderColor: theme.separator,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${product.productName}${variantLabel ? `. ${variantLabel}` : ""}. ${ready ? "Ready to score" : "Needs ingredient data"}`}
      accessibilityHint={ready ? "Opens the product score" : "Shows options to scan ingredient data"}
    >
      <ProductImage product={product} theme={theme} />
      <View style={styles.productCopy}>
        <Text style={[styles.productName, { color: theme.textPrimary }]} numberOfLines={2}>
          {product.productName}
        </Text>
        {variantLabel ? (
          <Text style={[styles.productMeta, { color: theme.textSecondary }]} numberOfLines={1}>
            {variantLabel}
          </Text>
        ) : null}
        <Text style={[styles.productMeta, { color: theme.textTertiary }]} numberOfLines={1}>
          {[product.brand, sourceLabel(product)].filter(Boolean).join(" • ")}
        </Text>
        <View style={styles.productBadges}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: ready ? Colors.scoreExcellent + "12" : theme.surface,
                borderColor: ready ? Colors.scoreExcellent + "2A" : theme.separator,
              },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                { color: ready ? Colors.scoreExcellent : theme.textTertiary },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          </View>
          {productHasVerifiedImage(product) && (
            <View style={[styles.statusBadge, { backgroundColor: theme.card, borderColor: theme.textSecondary + "35" }]}>
              <BadgeCheck size={13} color={theme.textSecondary} strokeWidth={2.1} />
              <Text style={[styles.statusBadgeText, { color: theme.textSecondary }]}>
                Image verified
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function LabelSummary({ identification, theme }) {
  if (!identification) return null;

  const title = identification.found
    ? labelSummaryTitle(identification)
    : "No readable product label";

  return (
    <View style={[styles.labelSummary, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
      <Text style={[styles.labelSummaryEyebrow, { color: theme.textTertiary }]}>
        Label scan
      </Text>
      <Text style={[styles.labelSummaryTitle, { color: theme.textPrimary }]} numberOfLines={2}>
        {title}
      </Text>
      {identification.notes ? (
        <Text style={[styles.labelSummaryNote, { color: theme.textTertiary }]} numberOfLines={2}>
          {identification.notes}
        </Text>
      ) : null}
    </View>
  );
}

function formatCorrectedQuery(value) {
  const brandTerms = new Map([
    ["acana", "ACANA"],
    ["iams", "IAMS"],
    ["nulo", "Nulo"],
    ["purina", "Purina"],
  ]);

  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((term) => brandTerms.get(term) || `${term.charAt(0).toUpperCase()}${term.slice(1)}`)
    .join(" ");
}

function EmptyState({ theme, query, identification, onScanLabel, onScanIngredients }) {
  const hasQuery = query.trim().length >= MIN_QUERY_LENGTH;
  const labelWasRead = identification?.found === true;
  const excludedProduct = identification?.excluded === true;
  const hasAcquisitionGap = hasQuery || labelWasRead;
  const cameFromLabel = identification != null;
  return (
    <View style={styles.emptyState}>
      <Search size={40} color={theme.textTertiary} strokeWidth={1.5} />
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
        {excludedProduct ? "Not a complete pet food" : hasAcquisitionGap ? "No verified match yet" : "Find a product"}
      </Text>
      <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
        {excludedProduct
          ? `${identification.exclusionReason || "This item is not a complete dog or cat food."} Woof scores complete foods only.`
          : labelWasRead
          ? "Woof found the product name but not a verified catalog match. Scan the ingredients list so it can be reviewed and added."
          : hasQuery
            ? "Check the product name, scan the front label, or scan the ingredients list if this product is not verified yet."
            : "Search by product name or scan the front label from the shelf. Barcode pickup is optional, not required."}
      </Text>
      <Pressable
        onPress={hasAcquisitionGap && !excludedProduct ? onScanIngredients : onScanLabel}
        style={({ pressed }) => [
          styles.emptyButton,
          { backgroundColor: theme.buttonPrimary, opacity: pressed ? 0.84 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={hasAcquisitionGap && !excludedProduct ? "Scan ingredients list" : "Scan a product label"}
      >
        <Camera size={17} color={theme.buttonText} strokeWidth={2} />
        <Text style={[styles.emptyButtonText, { color: theme.buttonText }]}>
          {hasAcquisitionGap && !excludedProduct ? "Scan Ingredients" : "Scan Front Label"}
        </Text>
      </Pressable>
      {hasAcquisitionGap && !excludedProduct ? (
        <Pressable
          onPress={onScanLabel}
          style={({ pressed }) => [
            styles.emptySecondaryButton,
            { borderColor: theme.separator, opacity: pressed ? 0.78 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={cameFromLabel ? "Try another front label photo" : "Scan a product label"}
        >
          <Text style={[styles.emptySecondaryButtonText, { color: theme.textPrimary }]}>
            {cameFromLabel ? "Try Front Label Again" : "Scan Front Label"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ProductSearchScreen({ navigation, route }) {
  const theme = useTheme();
  const initialQuery = route.params?.initialQuery || "";
  const labelImageBase64 = route.params?.labelImageBase64 || null;
  const labelImageUri = route.params?.labelImageUri || null;
  const labelOcrText = route.params?.labelOcrText || "";
  const labelOcrLines = route.params?.labelOcrLines ?? EMPTY_OCR_LINES;
  const labelOcrDurationMs = Number(route.params?.labelOcrDurationMs) || null;
  const labelCaptureId = route.params?.labelCaptureId || "";
  const labelCaptureStartedAt = Number(route.params?.labelCaptureStartedAt) || null;
  const hasLabelLookupInput = Boolean(labelImageBase64 || labelOcrText);
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState([]);
  const [identification, setIdentification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [labelLoading, setLabelLoading] = useState(hasLabelLookupInput);
  const [error, setError] = useState(null);
  const [showingCached, setShowingCached] = useState(false);
  const [searchCorrection, setSearchCorrection] = useState("");
  const searchRunRef = useRef(0);
  const labelRunRef = useRef(null);
  const lastSubmittedQueryRef = useRef("");

  const trimmedQuery = query.trim();
  const title = labelLoading ? "Reading label" : "Find Product";

  const labelLookupErrorMessage = useCallback((err) => {
    const message = String(err?.message || "").toLowerCase();
    if (message.includes("timed out") || message.includes("abort")) {
      return "Could not read that label in time. Search the brand or recipe name instead.";
    }
    if (message.includes("rate limit")) {
      return "Label lookup is busy right now. Search the brand or recipe name instead.";
    }
    return "Could not read that label. Try a clearer front-of-package photo or search by name.";
  }, []);

  const openProductResult = useCallback((product, {
    sourceSurface = "product_search",
    autoOpen = false,
    labelConfidence = null,
    matchQuery = query,
  } = {}) => {
    if (!autoOpen) {
      Haptics.selectionAsync();
    }

    trackEvent(autoOpen ? "catalog_label_auto_opened" : "catalog_product_opened", {
      source_surface: sourceSurface,
      source: product.source,
      source_kind: product.sourceKind,
      source_quality: product.sourceQuality,
      ingredient_verification_status: product.ingredientVerificationStatus,
      image_verification_status: product.imageVerificationStatus,
      has_image: !!product.imageUrl,
      ready_to_score: productIsReady(product),
      ingredient_count: product.ingredientCount,
      label_confidence: labelConfidence,
    });

    if (!productIsReady(product)) {
      logCatalogVerificationGapEvent({
        source: sourceSurface,
        query: matchQuery || query || product.productName,
        products,
        selectedProduct: product,
        trigger: autoOpen ? "auto_open_blocked" : "product_tapped",
      });
      Alert.alert(
        "Ingredient verification needed",
        "Woof found this product by name, but needs the full ingredients list before it can be reviewed and scored accurately.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Scan Ingredients",
            onPress: () => navigation.navigate("Scanner", {
              mode: "ingredient_capture",
              acquisitionQuery: matchQuery || query || product.productName,
              candidateProduct: ingredientCaptureProduct(product),
              sourceSurface,
            }),
          },
        ],
      );
      return;
    }

    navigation.navigate("Results", {
      mode: "catalog",
      cacheKey: product.cacheKey,
      catalogProduct: product,
      uri: labelImageUri || product.imageUrl || null,
    });
  }, [navigation, labelImageUri, products, query]);
  const openProductResultRef = useRef(openProductResult);

  useEffect(() => {
    openProductResultRef.current = openProductResult;
  }, [openProductResult]);

  const runSearch = useCallback(async (nextQuery, source = "typed") => {
    const term = nextQuery.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setProducts([]);
      setError(null);
      setShowingCached(false);
      setSearchCorrection("");
      return;
    }

    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;
    setLoading(true);
    setError(null);
    setSearchCorrection("");

    const controller = new AbortController();
    const startedAt = Date.now();
    let servedCached = false;
    try {
      const cached = await getCachedCatalogSearch(term, { limit: SEARCH_RESULT_LIMIT });
      if (searchRunRef.current !== runId) return;
      if (cached?.products?.length > 0) {
        servedCached = true;
        setProducts(cached.products);
        setShowingCached(true);
        trackEvent("catalog_search_cache_hit", {
          source,
          query_length: term.length,
          result_count: cached.products.length,
          cache_age_ms: Date.now() - cached.cachedAt,
        });
      }

      const result = await resolveProduct({
        type: "search",
        query: term,
        limit: SEARCH_RESULT_LIMIT,
        signal: controller.signal,
      });
      if (searchRunRef.current !== runId) return;
      setProducts(result.products);
      setShowingCached(false);
      setSearchCorrection(result.queryWasCorrected ? result.searchedQuery : "");
      saveCachedCatalogSearch(term, result.products).catch(() => {});
      logCatalogLookupEvent({
        source,
        query: term,
        products: result.products,
        resolverStatus: result.status,
        verificationState: result.verificationState,
        latencyMs: Date.now() - startedAt,
      });
      logCatalogVerificationGapEvent({
        source,
        query: term,
        products: result.products,
        resolverStatus: result.status,
        verificationState: result.verificationState,
        trigger: "search_results",
        latencyMs: Date.now() - startedAt,
      });
      trackEvent("catalog_search_completed", {
        source,
        resolver_status: result.status,
        query_length: term.length,
        result_count: result.products.length,
        image_result_count: result.products.filter((product) => !!product.imageUrl).length,
        served_cached_before_refresh: servedCached,
      });
    } catch (err) {
      if (searchRunRef.current !== runId) return;
      logger.debug("[PRODUCT_SEARCH] Search failed:", err.message);
      setError(servedCached ? "Could not refresh results. Showing the last saved match." : "Search failed. Please try again.");
      if (!servedCached) {
        setProducts([]);
        setShowingCached(false);
        setSearchCorrection("");
      }
      logCatalogLookupEvent({
        source,
        query: term,
        latencyMs: Date.now() - startedAt,
        errorMessage: err.message,
      });
      trackEvent("catalog_search_failed", {
        source,
        query_length: term.length,
        served_cached_before_failure: servedCached,
        message: err.message,
      });
    } finally {
      if (searchRunRef.current === runId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLabelLookupInput) return;
    const lookupKey = labelCaptureId
      || `${labelImageUri || "camera"}:${labelImageBase64?.length || 0}:${labelOcrText.length}`;
    if (labelRunRef.current === lookupKey) return;
    labelRunRef.current = lookupKey;
    const controller = new AbortController();

    (async () => {
      setLabelLoading(true);
      setError(null);
      setIdentification(null);
      setProducts([]);
      setShowingCached(false);
      setSearchCorrection("");
      trackEvent("label_lookup_started", {
        has_photo_uri: !!labelImageUri,
        image_base64_length: labelImageBase64?.length || 0,
        on_device_ocr_available: Boolean(labelOcrText || (labelImageUri && labelOcrIsAvailable())),
        on_device_ocr_precomputed: labelOcrText.length > 0,
        on_device_ocr_duration_ms: labelOcrDurationMs,
      });

      const resolverStartedAt = Date.now();
      const startedAt = labelCaptureStartedAt && labelCaptureStartedAt <= resolverStartedAt
        ? labelCaptureStartedAt
        : resolverStartedAt;
      try {
        const visualPromise = labelImageBase64
          ? resolveProduct({
            type: "label",
            imageBase64: labelImageBase64,
            signal: controller.signal,
            limit: SEARCH_RESULT_LIMIT,
          }).then((result) => ({ result, path: "cloud_image" }))
          : null;
        const canRunOcr = Boolean(labelOcrText || (labelImageUri && labelOcrIsAvailable()));
        const ocrPromise = canRunOcr
          ? resolveOnDeviceLabel({
            labelOcrText,
            labelOcrLines,
            labelOcrDurationMs,
            labelImageUri,
            signal: controller.signal,
            onOcrCompleted: (ocr) => {
              trackEvent("label_ocr_completed", {
                usable: ocr?.usable === true,
                duration_ms: Math.round(ocr?.durationMs || 0),
                line_count: ocr?.lines?.length || 0,
                text_length: ocr?.text?.length || 0,
                stage: "product_search_parallel",
              });
            },
          })
          : null;
        trackEvent("label_lookup_parallel_started", {
          visual_started: !!visualPromise,
          ocr_started: !!ocrPromise,
          capture_to_resolver_ms: resolverStartedAt - startedAt,
        });

        const outcome = await resolveFastLabelLookup({
          visualPromise,
          ocrPromise,
          signal: controller.signal,
        });
        const result = outcome?.result;
        const recognitionPath = outcome?.path || "cloud_image";

        if (!result) {
          throw new Error("No readable label text was found.");
        }
        setIdentification(result.identification);
        setProducts(result.products);
        setShowingCached(false);
        if (result.identification?.searchQuery) {
          setQuery(result.identification.searchQuery);
          lastSubmittedQueryRef.current = result.identification.searchQuery;
          saveCachedCatalogSearch(result.identification.searchQuery, result.products).catch(() => {});
          saveCachedCatalogSearch(result.identification.searchQuery, result.products, {
            petType: result.identification?.petType,
          }).catch(() => {});
        }
        logCatalogLookupEvent({
          source: recognitionPath === "on_device_ocr" ? "label_scan_on_device" : "label_scan",
          query: result.identification?.searchQuery,
          identification: result.identification,
          products: result.products,
          resolverStatus: result.status,
          verificationState: result.verificationState,
          latencyMs: Date.now() - startedAt,
        });
        logCatalogVerificationGapEvent({
          source: recognitionPath === "on_device_ocr" ? "label_scan_on_device" : "label_scan",
          query: result.identification?.searchQuery,
          identification: result.identification,
          products: result.products,
          resolverStatus: result.status,
          verificationState: result.verificationState,
          trigger: result.selectedProduct ? "label_recommendation" : "label_results",
          latencyMs: Date.now() - startedAt,
        });
        trackEvent("label_lookup_completed", {
          found: !!result.identification?.found,
          resolver_status: result.status,
          confidence: result.identification?.confidence ?? null,
          result_count: result.products.length,
          image_result_count: result.products.filter((product) => !!product.imageUrl).length,
          auto_opened: !!result.selectedProduct,
          recognition_path: recognitionPath,
          total_latency_ms: Date.now() - startedAt,
          resolver_latency_ms: Date.now() - resolverStartedAt,
          capture_to_resolver_ms: resolverStartedAt - startedAt,
        });
        if (result.selectedProduct) {
          openProductResultRef.current(result.selectedProduct, {
            sourceSurface: recognitionPath === "on_device_ocr" ? "label_scan_on_device" : "label_scan",
            autoOpen: true,
            labelConfidence: result.identification?.confidence ?? null,
            matchQuery: result.identification?.searchQuery || result.identification?.productName || "",
          });
        }
      } catch (err) {
        if (err.name === "AbortError" && controller.signal.aborted) return;
        logger.debug("[PRODUCT_SEARCH] Label lookup failed:", err.message);
        setError(labelLookupErrorMessage(err));
        logCatalogLookupEvent({
          source: "label_scan",
          latencyMs: Date.now() - startedAt,
          errorMessage: err.message,
        });
        trackEvent("label_lookup_failed", { message: err.message });
      } finally {
        setLabelLoading(false);
      }
    })();

    return () => controller.abort();
  }, [
    hasLabelLookupInput,
    labelCaptureId,
    labelCaptureStartedAt,
    labelImageBase64,
    labelImageUri,
    labelLookupErrorMessage,
    labelOcrDurationMs,
    labelOcrLines,
    labelOcrText,
  ]);

  useEffect(() => {
    if (labelLoading) return;
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setProducts([]);
      return;
    }
    if (trimmedQuery === lastSubmittedQueryRef.current) return;

    const timer = setTimeout(() => {
      lastSubmittedQueryRef.current = trimmedQuery;
      runSearch(trimmedQuery, "typed");
    }, 280);

    return () => clearTimeout(timer);
  }, [trimmedQuery, labelLoading, runSearch]);

  const handleSubmit = () => {
    Keyboard.dismiss();
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return;
    Haptics.selectionAsync();
    lastSubmittedQueryRef.current = trimmedQuery;
    runSearch(trimmedQuery, "submit");
  };

  const handleClear = () => {
    Haptics.selectionAsync();
    setQuery("");
    setProducts([]);
    setIdentification(null);
    setError(null);
    setShowingCached(false);
    setSearchCorrection("");
    lastSubmittedQueryRef.current = "";
    trackEvent("catalog_search_cleared");
  };

  const handleScanLabel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackEvent("catalog_label_scan_tapped", { source_surface: "product_search" });
    navigation.navigate("Scanner", {
      mode: "label_lookup",
      returnToProductSearch: true,
    });
  };

  const handleScanIngredients = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const acquisitionQuery = query.trim()
      || identification?.searchQuery
      || [identification?.brand, identification?.productName].filter(Boolean).join(" ");
    trackEvent("catalog_ingredient_capture_tapped", {
      source_surface: "product_search",
      query_present: acquisitionQuery.length > 0,
      label_found: identification?.found === true,
    });
    navigation.navigate("Scanner", {
      mode: "ingredient_capture",
      acquisitionQuery,
      labelIdentification: identification,
      sourceSurface: "product_search_gap",
    });
  };

  const handleProductPress = (product) => {
    openProductResult(product, { matchQuery: query });
  };

  const resultCopy = useMemo(() => {
    if ((loading || labelLoading) && !(showingCached && products.length > 0)) {
      return "Searching catalog";
    }
    if (products.length === 0) return "";
    const count = products.length === 1 ? "1 possible match" : `${products.length} possible matches`;
    return showingCached ? `${count} • refreshing` : count;
  }, [loading, labelLoading, products, showingCached]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
        <Pressable
          onPress={handleScanLabel}
          hitSlop={12}
          style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Scan product label"
        >
          <Camera size={20} color={theme.textPrimary} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.card, borderColor: theme.separator },
          ]}
        >
          <Search size={18} color={theme.textTertiary} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            placeholder="Search name, brand, or flavor"
            placeholderTextColor={theme.textTertiary}
            returnKeyType="search"
            autoCapitalize="words"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.textPrimary }]}
            accessibilityLabel="Search products by name"
          />
          {query.length > 0 && (
            <Pressable
              onPress={handleClear}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={17} color={theme.textTertiary} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item, index) => `${item.sourceKind}:${item.cacheKey || item.barcode || item.id}:${index}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.listContent,
          products.length === 0 && styles.listContentEmpty,
        ]}
        ListHeaderComponent={(
          <View style={styles.listHeader}>
            <LabelSummary identification={identification} theme={theme} />
            {resultCopy ? (
              <Text style={[styles.resultCopy, { color: theme.textTertiary }]}>
                {resultCopy}
              </Text>
            ) : null}
            {searchCorrection ? (
              <Text
                style={[styles.correctionText, { color: theme.textSecondary }]}
                accessibilityLiveRegion="polite"
              >
                {products.length > 0 ? "Showing results for" : "Searched as"} “{formatCorrectedQuery(searchCorrection)}”
              </Text>
            ) : null}
            {error ? (
              <Text style={[styles.errorText, { color: Colors.scoreConcerning }]}>
                {error}
              </Text>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            theme={theme}
            onPress={() => handleProductPress(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          loading || labelLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={theme.textPrimary} />
              <Text style={[styles.loadingText, { color: theme.textTertiary }]}>
                {labelLoading ? "Reading product label..." : "Searching products..."}
              </Text>
            </View>
          ) : (
            <EmptyState
              theme={theme}
              query={query}
              identification={identification}
              onScanLabel={handleScanLabel}
              onScanIngredients={handleScanIngredients}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0,
  },
  searchWrap: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 12,
  },
  searchBox: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 11,
  },
  listContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: 36,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listHeader: {
    paddingBottom: 10,
  },
  labelSummary: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
  },
  labelSummaryEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: 5,
  },
  labelSummaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  labelSummaryNote: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  resultCopy: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  correctionText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 6,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 8,
  },
  productRow: {
    minHeight: 112,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    gap: 12,
    ...Shadows.card,
  },
  productImage: {
    width: 84,
    height: 92,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  productImagePlaceholder: {
    width: 84,
    height: 92,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    letterSpacing: 0,
    marginBottom: 5,
  },
  productMeta: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "capitalize",
    marginBottom: 10,
  },
  productBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  statusBadge: {
    minHeight: 26,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  emptyButton: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 22,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
  },
  emptySecondaryButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  emptySecondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
  },
});
